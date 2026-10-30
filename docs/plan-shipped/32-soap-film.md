# 32. The soap film: a draining film seen in reflection (asked 2026-10-18): what shipped

How §32's shipped items were found, built and measured. The open work is in
[`docs/plan/32-soap-film.md`](../plan/32-soap-film.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Second pass (moved 2026-10-04)

### 32. The soap film: a draining film seen in reflection

#### 32a. The CPU reference (#403)

Built `src/lib/soapFilm.ts` (`createSoapFilm`, `stepSoapFilm`, `soapFilmRgb`), added the
sixth argument `cosI = 1` to `filmReflectance` (and optional `cosI = 1` to `filmColour`)
in `src/lib/filmTable.ts`, and wired `npm run soapfilm` into `.github/workflows/checks.yml`
under `Measure · logic`.

Method: 2D incompressible Darcy buoyancy flow `u = (1/ζ)(−∇p + ρ g (h − h̄) ŷ)` with
`∇·u = 0` on a staggered MAC grid (`ρ g = 9810`, `ζ = 1.5`, default `dx = 1e-3` m),
Gauss-Seidel projection with over-relaxation (`f.uf` and `f.vf` exposed on the cell faces,
zero at all four walls), conservative second-order minmod-limited advection of `h`,
constant evaporation (`evap` nm/s), and exponential relaxation (`τ = 0.5` s) to the 8 nm
Newton-black film once a cell thins below 30 nm without refilling. Named shortcuts (a)–(e)
are documented in `PLAN.md` §32 and `src/lib/soapFilm.ts`.

Measured: `npm run soapfilm` 23/23 (C1 thick patch down 29.4 rows, thin patch up 22.6 rows;
C2 mass drift 3.3e-15, uniform film 0.0e+0 nm; C3 `g = 0` 0.0e+0 nm, half-gravity ratio
0.54, reversed gravity −20.9 rows; C4 peak excess at 5 s 663/800 nm, mass ratio 0.77,
max `|∇·u|` 9.2e-5 /s against 1.9e-3 /s, 0.00% of cells outside face flux interval, wall
flow 0; C5 550 nm first max 103.5 nm at 0°, 111.5 nm at 30°, 126.5 nm at 50°, Airy
agreement 8.3e-17, table and angle match 0.00/255; C6 quarter means ordered from 30 s,
top reaches 10% black first at 115 s, no ruptured cell refills; C7 4 consecutive 5 s
samples in the photograph window, at t=120 s 5.1% under 30 nm, 23.3% dark, 79% saturated,
9/12 hue sectors); `npm run filmtable` 8/8; 600 steps of the 32×64 film in 0.69 s.

#### 32b. The reflected view (this PR, #469)

Extended `soapFilmRgb` in `src/lib/soapFilm.ts` so a 2D draining vertical film (`ny > 1`, or
`softBox: true`) is read in reflected light at viewing angle `cosI` on a dark ground
(`ground = 0.0004` through transmittance `1 − R`), where Snell's law sets the internal path
thickness `d_eff = h cos θ_t` and Airy reflectance is summed over a 4-point path spread
(`spread = 0.025`) around `d_eff` before clamping negative linear sRGB channels to 0. That
4-point path spread and dark ground alone move C7's `t = 120` s saturation by two points from
32a's 79% down to 77% (dark 22.7%, 9/12 hues). The rest of the drop to the photograph's 15%
saturated is a colour grade (`notchFloor = 0.0725` lifting each pixel's lowest linear channel
and `chromaRetention = 0.67` pulling each channel a third of the way toward grey while
rescaling to preserve luminous reflectance `Y(d_eff)`) standing in for the soft box's angular
spread and the camera's gamut, not the physics itself: with the grade off (`notchFloor = 0`,
`chromaRetention = 1`) saturation at `t = 120` s is 77% (dark 22.7%, 9/12 hues), and with the
grade on it is 13% at `t = 120` s (14.8% at `t = 110` s, dark 19.4%, 8/12 hues) against the
photograph's 15% saturated and 9/12 hues. A 1-row calibration strip (`ny === 1` with `softBox`
unset) continues to read the raw point-source `filmColour` table directly. Named shortcut (f)
(normal-incidence Fresnel amplitudes kept at all angles, no s/p split; plus `notchFloor` and
`chromaRetention` as a colour grade standing in for the soft box's solid-angle spread and
camera gamut) in `PLAN.md` §32 and `src/lib/soapFilm.ts`, and queued `PLAN.md` 32b-1 to replace
the grade with the solid-angle integral over `cosI` (with s/p Fresnel terms) and camera gamut
mapping.

Measured: `npm run soapfilm` 23/23 with C7's saturation bar unchanged (`4 samples in a row
(5 s apart)` across `t = 105..120` s: at `t = 105` s saturated 17.2%, silver 10.7%, dark 9.5%,
black 0.8%; at `t = 110` s saturated 14.8%, silver 8.1%, dark 12.3%, black 1.5%; at `t = 115` s
saturated 12.5%, silver 7.4%, dark 16.6%, black 2.5%; at `t = 120` s film under 30 nm 5.1%,
dark 19.4%, saturated 13%, silver 10.2%, 8/12 hues — against the photograph's 15% saturated,
10.9% silver, 14.3% dark, 1.1% black, 9/12 hues; control with `notchFloor = 0` and
`chromaRetention = 1` gives 77% saturated, 22.7% dark, 9/12 hues at `t = 120` s);
`npm run filmtable` 8/8. Three-angle render of the `t = 115` s film at `0°`, `30°` and `50°`
(`cos θ_t = 1.000, 0.927, 0.817`): the Newton-black lace (`< 30` nm, `luma < 0.12`) stays
pinned at the top (`centroid row = 1.00, 1.01, 1.09`), while the first-order purple dark
fringe (`d_eff ≈ 200` nm) shifts down from row 27 (`h = 206.7` nm) at `0°` to row 28
(`h = 208.6` nm) at `30°` to row 45 (`h = 246.0` nm) at `50°`, and the second-order green-gold
peak (`d_eff ≈ 320` nm) shifts down from row 71 (`h = 319.9` nm) at `0°` to row 78
(`h = 353.1` nm) at `30°` to row 84 (`h = 393.2` nm) at `50°`.

#### 32c. The GPU solver (this PR, #505)

Built `src/gpu/soapFilm.ts` (`createSoapFilmGpu(device, { nx, ny, dx })` with `write(h)`,
`step(dt, { g, evap, zeta })`, `read() → { h, uf, vf }` and `destroy()`) and its compute
shaders in `src/gpu/wgsl/soapFilm.ts` (`soapSetup`, `soapSorRed`, `soapSorBlack`, `soapProject`,
`soapTransport`), implementing the CPU reference (`src/lib/soapFilm.ts`, `stepSoapFilm`) pass
for pass on the GPU under the contract in `scripts/soapgpu-cpu.ts`:
- `soapSetup`: marks cells with `h < 30` nm (`BLACK_THRESHOLD_NM`) as ruptured, reduces the
  film's mean thickness `hbar` (and mean-centres `p` when warm-started so float32 gauge drift
  cannot accumulate over thousands of steps), evaluates unprojected vertical Darcy buoyancy
  `v* = (rho * g / zeta) * (h_face - hbar) * 1e-9` on the interior horizontal faces
  (`j = 1 .. ny - 1`) with all four walls shut, reduces `maxStar = max |v*|`, and forms the
  unprojected cell divergence `rhs_ij = vf*[j+1, i] - vf*[j, i]` (or zeroes `uf`, `vf`, `p`
  and `rhs` when `maxStar <= 1e-18`).
- `soapSorRed` / `soapSorBlack`: solves `deg_ij * p_ij - sum_neighbours(p) = -rhs_ij` on the
  staggered MAC grid by red-black SOR with `omega = 2 / (1 + sin(pi / max(nx, ny)))`,
  warm-started from the previous step's tension `p` (60 sweeps warm, 80 sweeps cold when `g`
  changes or `write(h)` lays a fresh film).
- `soapProject`: projects interior MAC face velocities `uf[i, j] = -(p[i, j] - p[i-1, j])`
  and `vf[i, j] = vf*[i, j] - (p[i, j] - p[i, j-1])` with walls zero, reduces `uMax`, and
  sets the CFL sub-step count `steps = max(1, ceil(uMax * dt / (0.45 * dx)))`.
- `soapTransport`: advances `h` through `steps` conservative flux-form sub-steps using
  second-order upwind reconstruction with the minmod limiter (`sx`, `sy`), computing each
  shared face flux (`fx`, `fy`) once for both adjacent cells and blocking inflow into ruptured
  cells when `evap > 0`, followed by uniform evaporation (`evap` nm/s) and exponential
  relaxation (`BLACK_RELAX_TAU = 0.5` s) of ruptured cells (`< 30` nm) toward Newton black
  (`8` nm).
- Constants (`RHO_WATER = 1000`, `DEFAULT_ZETA = 1.5`, `BLACK_THRESHOLD_NM = 30`,
  `NEWTON_BLACK_NM = 8`, `BLACK_RELAX_TAU = 0.5`) are copied under the same names rather than
  imported from `src/lib/soapFilm.ts`, so the GPU solver's bundle carries 0 bytes of the CPU
  reference.
- Wired `npm run soapgpu` into `scripts/checks.json` on the Mac `plate` shard beside `sloshgpu`,
  and `npm run soapgpu -- --selftest` into `Measure`'s `lab` shard beside `sloshgpu` (in `lab`
  rather than `logic` because `scripts/soapgpu.mjs` calls `openLab` to launch Chromium and
  request a WebGPU adapter even under `--selftest`, and `checks.yml` installs Chromium only on
  the `browser` and `lab` shards).

Measured: `npm run soapgpu` 29/29 on `apple metal-3` (first-step face flows RMS diff 0.195%
within 2%, thickness change 1.116% within 5%; 1 s thickness RMS diff 0.065% at `dt = 0.05` s,
0.022% at `dt = 1/60` s, and 0.884% at `zeta = 0.25, dt = 0.2` s across 4 CFL sub-steps; C1
thick patch +29.41 vs +29.41 rows, thin patch −22.56 vs −22.55 rows; C4 excess 83%, mass 0.77,
max `|div u|` 1.8e-4 /s against 1.9e-3 /s, 0.00% of cells outside face fluxes, wall flow 0; C2
mass drift 7.0e-9, uniform film 0.0e+0 nm; C3 `g = 0` 0.0e+0 nm, half-gravity ratio 0.54,
reversed −20.86 vs −20.85 rows; C6 quarter means ordered from 30 s, worst quarter mean diff
0.08%, top 10% black at 115 s vs 115 s, 0 refilled on the drain or on the torn hole, black hole
spread 160 vs 160 cells; 0 of 4785 steps idle, 0 of 514 reads idle; `src/lib/soapFilm.ts` not in
bundle; 0 WebGPU errors; `cost: 2.44 ms a step at 256 × 256 on apple metal-3`); `npm run soapgpu
-- --selftest` 29/29 (`cost: 189.18 ms a step at 256 × 256`); `npm run soapfilm` 23/23; `npm run
wgsl` 142 shaders; `npm run physics` 20/20; `npm run derive` 4/4.

## Third pass (moved 2026-10-29, 19m)

### 32. The soap film: a draining film seen in reflection (asked 2026-10-18)

#### ~~32b. The reflected view~~ — **Shipped, this PR (#469)** (`soapFilmRgb` reflected view in `src/lib/soapFilm.ts` with Snell path factor `d_eff = h cos θ_t`, 4-point path spread `spread = 0.025`, dark ground `ground = 0.0004`, and colour grade `notchFloor = 0.0725`, `chromaRetention = 0.67` named under shortcut (f) in `PLAN.md` §32 and `src/lib/soapFilm.ts`; `npm run soapfilm` 23/23 with C7 saturation bar unchanged, `npm run filmtable` 8/8; control with the grade off (`notchFloor = 0`, `chromaRetention = 1`) is 77% saturated, 22.7% dark, 9/12 hues at t=120 s, and with the grade on is 13% saturated, 19.4% dark, 8/12 hues at t=120 s (14.8% saturated, 12/12 hues at t=110 s) against the photograph's 15% saturated and 9/12 hues; 3-angle render at 0°/30°/50° shows bands shift down by 13–18 rows while Newton-black lace stays at row 1.00–1.09; story in `docs/plan-shipped/32-soap-film.md` §32b; replacing the grade with the real solid-angle integral and camera gamut mapping is 32b-1 below)

#### ~~32c. The GPU solver~~ — **Shipped, this PR (#505)** (`src/gpu/soapFilm.ts` exporting `createSoapFilmGpu`, `src/gpu/wgsl/soapFilm.ts` with `soapSetup`, `soapSorRed`, `soapSorBlack`, `soapProject` and `soapTransport`, and `scripts/checks.json` wiring `npm run soapgpu` on the Mac `plate` shard beside `sloshgpu` and `npm run soapgpu -- --selftest` on Measure's `lab` shard beside `sloshgpu`; `npm run soapgpu` 29/29 on `apple metal-3` — first-step flows 0.195%, first-step thickness 1.116%, 1 s thickness 0.065% at `dt = 0.05` s, 0.022% at `dt = 1/60` s, 0.884% at `zeta = 0.25, dt = 0.2` s with 4 CFL sub-steps, C1 thick +29.41 vs +29.41 and thin −22.56 vs −22.55 rows, C2 drift 7.0e-9, C3 reversed −20.86 vs −20.85 rows, C4 max `|div u|` 1.8e-4 /s, C6 worst quarter mean 0.08%, top black at 115 s vs 115 s, torn hole 0 refilled and 160 vs 160 black cells, 0 of 4785 steps idle, 0 of 514 reads idle, `src/lib/soapFilm.ts` absent from bundle, `cost: 2.44 ms a step at 256 × 256 on apple metal-3`; `npm run soapgpu -- --selftest` 29/29; `npm run soapfilm` 23/23; `npm run wgsl` 142 shaders; `npm run physics` 20/20; `npm run derive` 4/4; story in `docs/plan-shipped/32-soap-film.md` §32c)

## Fourth pass (moved 2026-10-29, 19m-2)

### 32. The soap film: a draining film seen in reflection (asked 2026-10-18)

#### 32a. The target (numbers, from the photograph and from the prototype)

**The target (numbers, from the photograph and from the prototype).** A 32 × 64 film of
seeded noise on 800 nm, evaporating at 5 nm/s, at `dt` 0.05, over 120 s, sampled every
5 s. The prototype reaches true rupture (film under 30 nm, the only black that is the
film's and not a dark band's) after about 95 s, so the look stage is short: at 110 s the
film under 30 nm is 2.7%, dark 16.1%, saturated 83%, 9 of 12 hue sectors, and the window
the check asks for is exactly its three samples in a row, so 32a has no slack there and
should say so in its PR rather than tune toward it. One honest gap: the prototype is far
more saturated than the photograph (80–90%, against 15%) because the reflected table at
gain 4 is colourful, and the photograph's silver and white come from the look (the gain,
the ground, light that is not a point), so the saturation bar asks only for *more than*
10%, and 32b is where the look is tuned toward the photo's 15%.

#### 32a. The check: npm run soapfilm

**The check: `npm run soapfilm`** (`scripts/soapfilm.mjs`, node only, 7 groups, 23 lines).
It holds the *model*, not a picture of it, and it was written against three look-alikes
that it must fail (a film with no black, a blur laid over a fixed ramp, and a
compressible flow), each of which passed an earlier, weaker draft. C1 gravity sorts the
film (a 1600 nm patch sinks and a 400 nm one rises, each at least a quarter of the film's
height in 600 steps); C2 nothing is made or lost (mean thickness to 1e-9, a uniform film
stays uniform); C3 gravity is the only driver (with `g = 0` a noisy film does not move at
all; with `g` reversed the sort reverses; half the gravity sorts about half as fast, a
ratio of 0.35 to 0.7 after 2.5 s: the owner's rule against whole-frame motion from
sound); C4 the flow is a flow and the thickness moves with it (face divergence under
1e-3 of the fastest speed over the cell size; the falling patch keeps a local peak of at
least 45% of its excess after 5 s, where first-order upwind keeps 38% and a limited
second-order scheme 51%, and its mass stays within 0.3 to 1.7 of the start; and every
cell's change in a step lies in the interval its faces' flows could carry, the face
thickness taken anywhere between its two neighbours, so a smoothed film or a flow that is
reported but not used falls outside); C5 the colours move with the angle (the picture is
the table's colour for each thickness to 1.5/255, in 0..1, a film at 30° and 50° looks
like a thinner one straight on, `d cos θ_t`, an independently written Airy formula
agrees with the table to 1e-6, and `cosI = 1` is the table's own value); C6 the film
drains like a real one (quarter means grow top to bottom from 30 s on, the top reaches
true rupture first and by 120 s, a ruptured cell stays black); C7 it looks like the
photograph (a window of at least three samples in a row in which film under 30 nm is
between 0.5% and 6%, dark between 3% and 25%, saturated over 10% and at least 7 of the 12
hue sectors held; check C7 has no upper bound on saturation — `sat > 0.10` only — so it
would pass a film far more saturated than the photograph, such as main's 79% or the
ungraded 77%, for a check session to add that bar). Black is the film's thickness, never the picture's brightness. Against
a scratch prototype of the model above (not committed) it reads 23 of 23; with no
`src/lib/soapFilm.ts` it exits 1 and says so. A bar is never moved to get green: if the
model cannot reach one, the PR says what it reached and asks.

#### 32b. The reflected view (the heading's story)

#### ~~32b. The reflected view~~ — **Shipped, this PR (#469)** (`soapFilmRgb` reflected view in `src/lib/soapFilm.ts` with Snell path factor `d_eff = h cos θ_t`, 4-point path spread `spread = 0.025`, dark ground `ground = 0.0004`, and colour grade `notchFloor = 0.0725`, `chromaRetention = 0.67` named under shortcut (f) in `PLAN.md` §32 and `src/lib/soapFilm.ts`; `npm run soapfilm` 23/23 with C7 saturation bar unchanged, `npm run filmtable` 8/8; control with the grade off (`notchFloor = 0`, `chromaRetention = 1`) is 77% saturated, 22.7% dark, 9/12 hues at t=120 s, and with the grade on is 13% saturated, 19.4% dark, 8/12 hues at t=120 s (14.8% saturated, 12/12 hues at t=110 s) against the photograph's 15% saturated and 9/12 hues; 3-angle render at 0°/30°/50° shows bands shift down by 13–18 rows while Newton-black lace stays at row 1.00–1.09; story in `docs/plan-shipped/32-soap-film.md` §32b; replacing the grade with the real solid-angle integral and camera gamut mapping is 32b-1 below)

#### 32c. The GPU solver (the heading's story)

#### ~~32c. The GPU solver~~ — **Shipped, this PR (#505)** (`src/gpu/soapFilm.ts` exporting `createSoapFilmGpu`, `src/gpu/wgsl/soapFilm.ts` with `soapSetup`, `soapSorRed`, `soapSorBlack`, `soapProject` and `soapTransport`, and `scripts/checks.json` wiring `npm run soapgpu` on the Mac `plate` shard beside `sloshgpu` and `npm run soapgpu -- --selftest` on Measure's `lab` shard beside `sloshgpu`; `npm run soapgpu` 29/29 on `apple metal-3` — first-step flows 0.195%, first-step thickness 1.116%, 1 s thickness 0.065% at `dt = 0.05` s, 0.022% at `dt = 1/60` s, 0.884% at `zeta = 0.25, dt = 0.2` s with 4 CFL sub-steps, C1 thick +29.41 vs +29.41 and thin −22.56 vs −22.55 rows, C2 drift 7.0e-9, C3 reversed −20.86 vs −20.85 rows, C4 max `|div u|` 1.8e-4 /s, C6 worst quarter mean 0.08%, top black at 115 s vs 115 s, torn hole 0 refilled and 160 vs 160 black cells, 0 of 4785 steps idle, 0 of 514 reads idle, `src/lib/soapFilm.ts` absent from bundle, `cost: 2.44 ms a step at 256 × 256 on apple metal-3`; `npm run soapgpu -- --selftest` 29/29; `npm run soapfilm` 23/23; `npm run wgsl` 142 shaders; `npm run physics` 20/20; `npm run derive` 4/4; story in `docs/plan-shipped/32-soap-film.md` §32c)
