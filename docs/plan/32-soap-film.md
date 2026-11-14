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

**Named shortcuts (the owner's rule: name them, give each a plan item).** Numbered as items
2026-10-30 (38o): (a) is 32h, (b) is 32i, (c) is 32f (shipped), (d) is 32g (shipped), (e) is 32j,
(f) is 32b-1. What (c) and (d) said below is the prototype's, kept as the record.
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

## ~~32f. The frame drains the film (shortcut c)~~ — **Shipped** (`drainToBorder` in `src/lib/soapFilm.ts`, the border pass in `src/gpu/wgsl/soapFilm.ts`'s `soapTransport`; `npm run soapfilm` C8, five lines; `npm run soapgpu` 32f)

**Shipped.** Story in `docs/plan-shipped.md` §32f (2026-10-30).

- **32f-1. The border's exchange speed is the buoyant Darcy speed at the tuned ζ.** It inherits
  32i's time compression: at a real ζ the fresh film would be thicker and slower. Re-measure C8
  when 32i lands.
- **32f-2. The bottom border is a fixed radius.** Real drainage fills the bottom border (r0 grows
  with the liquid the borders take). `f.drained` is that liquid; r0 from it is the next step.

## ~~32g. Black spots on Vrij's clock (shortcut d)~~ — **Shipped** (`blackSpots` in `src/lib/soapFilm.ts`, the same in `soapTransport`; `npm run soapfilm` C9, four lines; `npm run soapgpu` 32g, two)

**Shipped.** Story in `docs/plan-shipped.md` §32g (2026-10-30).

- **32g-1. The black front moves one cell a step.** Its speed is the grid's (2 cm/s at 1 mm and
  dt 0.05), not the spot's. Real black spots grow at a speed set by the black film's lower
  tension against the rim's drag (Mysels); that law is the next step.
- **32g-2. Vrij's clock sits on the grid.** It does not travel with the film. It matters only
  under about 60 nm, where the film barely moves, but advecting it with h is the honest form.
- **32g-3. Only van der Waals.** The double-layer repulsion that sets a common black film's
  thickness (DLVO) is left out: every spot goes straight to Newton black.

## ~~32h. Gravity in the plane (shortcut a)~~ — **Shipped 2026-11-13** (Frame Tilt, `soapFilmTilt`, g sin θ along the film and in the fresh film's profile; the look Soap Film at 12°; `npm run soapplate` 7; story in `docs/plan-shipped.md` under 32k)

- **32h-1. The tilt is in the plane only.** A frame near flat would also have the film's weight
  across it (a sag, a few microns), which the model leaves out; and the frame drains toward its
  picture-bottom edge at any tilt, never sideways.

## ~~32k. The film's big swirls (a Brinkman film)~~ — **Shipped 2026-11-13** (gpu/soapAir.ts; `npm run soapplate` 7 and 8; story in `docs/plan-shipped.md`)

- **32k-1. The air is carried whole.** The film's surface viscosity resists its own plumes'
  small scales (the Brinkman solve) but takes the air's push at every scale whole (the 32d law,
  ζ_air = ζ), so a small gust moves it as a big one does. Honest: the air's push inside the same
  solve. Tried: it cut the stir under `soapplate` 4 to 0.6 nm; it needs 32d-1's own stir first.
- **32k-2. η is fitted to the tuned ζ.** η = ζ / k² at the 6 mm patches (1.4e-6 Pa·s·m), so
  the patches keep 32i's pace. Measured soap films run 1e-8 to 1e-6; at 2e-7 the film was much
  quicker and blurred into level bands within a cycle (the transport's own diffusion: 32k-3).
  Settle it with 32i.
- **32k-3. The transport blurs the marbling.** Minmod upwinding at 1 mm smears a filament a
  cell or two wide within seconds, and a real film keeps its edges sharp (it has no diffusion
  of its own): measured, the marbled phase after a dip lasts about half a cycle and the rest is
  soft bands. A sharper scheme (a high-order limiter, or a finer film grid where the swirls
  fold it) would keep the folds.
- **32k-4. The solve is warm-started.** 40 Jacobi sweeps a step on the air's grid: the big
  swirls follow a change in the film over a few steps, slower than the film's real spin-up
  (ρ h / ζ_air, under a tenth of a second).

## 32m. The lamp's heat stirs the air (tried, open)

A projector's lamp warms the air the frame hangs in, and warm air rises in plumes. Tried
2026-11-13 as a warm, uneven strip at the frame's foot (1.5 K, g β T on the air): the air moved
at a millimetre a second and the film not visibly. Worth a second look once the frame lies near
flat over a lamp (the heat then rises across the film, and stirs it from below in cells).

## 32i. Real drag, and time as its own dial (shortcut b)

ζ = 1.5 is fitted to make 30 s of show from minutes of drainage. Derive ζ from the film's own
drag (air friction on both faces and the monolayers' surface shear viscosity), and make the
compression a time-rate setting that runs the real physics faster, which may go past real (the
owner, 2026-10-30), instead of a wrong constant. Re-measure C1–C9 at the real ζ under the rate.

## 32j. The surfactant moves (shortcut e)

Marangoni plug flow: transport the surfactant's surface concentration Γ and let its gradient
push the film, which is what makes the film inextensible in the first place. Stiff (wave speed
about 7.7 m/s on this grid); needs an implicit step. Until then `div u = 0` carries it.

## ~~32d. On the plate~~ — **Shipped** (the look Soap Film, settings `soapFilm`, `soapFilmRate`, `soapFilmAngle`; `src/gpu/soapFilmPlate.ts`, `src/gpu/soapFrame.ts`, `src/gpu/wgsl/soapFilmPlate.ts`, `soapFilmOver` in `src/gpu/wgsl/plateThinFilm.ts`; `npm run soapplate` 13/13; story in `docs/plan-shipped.md` §32d)

- **32d-1. The air's stir is the plate's flow (named shortcut).** *The air layer shipped
  2026-11-13* (gpu/soapAir.ts: inertia, the film's plumes drag it, the room takes its momentum
  back; story in `docs/plan-shipped.md` under 32k). What is left: the air is pushed by the plate's
  flow at a constant 6 a second (`SOAP_AIR_K_STIR`, sized so a short stir carries the film about
  as far as the old copy did), not by a stir of its own. The honest form is Blow, the hands and
  the sound pushing the air directly. *Measure:* `soapplate` 4 with the air's own stir.
- **32d-2. The re-dip lays a profile, not a pull.** A drained film (mean under 160 nm) is
  drawn again top first over two seconds with Mysels' √z profile from 350 to 750 nm and
  patches 12 mm across at 50% (2026-11-13, a hand-drawn film's sheets; was 6 mm at 25%). A real dip bursts the old film first, and the fresh film's thickness is
  Frankel's at the speed the frame is pulled (1.34 ℓ_c Ca^(2/3)), thinning by gravity as it
  rises. Make the pull speed the dial and the profile its result; a burst (the black film's
  rupture opening from a spot, Culick's rim at √(2σ/ρh)) before it. *Measure:* `soapplate`'s
  re-dip lines, and the profile against Frankel at two pull speeds.
- **32d-3. The sound reaches the film only through the plate's flow.** Kicks open soap on the
  plate (the look's `surfactantFlow` patch), whose Marangoni flow is the film's air. A drop of
  solution landing on the film (thickening it where it lands, the way soap-film painters
  work) would be the film's own answer to a hit. *Measure:* a kick thickens the film where it
  lands, and the film's total grows by the drop.
- **32d-4. The film's cost on Metal.** The solver's setup, projection and transport are single
  workgroups over the film's 128² (2.4 ms a step at 256² on Metal, 32c); one film step per
  solver step. Measure it on the Mac (`npm run soapplate` prints nothing of the Mac's) and,
  if it shows in the frame, split those passes across workgroups (H2c's pattern).
- **32d-5. The plate's dye under the film is the old look's.** Soap Film still seeds and pours
  a faint dye (Dye Budget 0.3) that shows through the film's black and its thin orders. A real
  frame has nothing behind it but the dark ground; decide with the owner whether the dye stays
  as a colour under the film or goes.

## ~~32e. The phone~~ — **Shipped with 32d** (Soap Film, Drain Rate and Film Angle on the phone's remote, `RemoteControl.tsx`, as on the desk; `npm run phone` 366/366, `layout` 86/86)

*Not doing now:* a thickness that follows the dye (the film is its own medium; mixing it
with the pigment's opacity is 18k's old shortcut, and the reason for this section), Marangoni
plug flow (named above), and any recorded footage as a texture.
