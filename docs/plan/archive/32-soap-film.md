# Archive: 32. The soap film: a draining film seen in reflection (asked 2026-10-18)

The closed items of [`docs/plan/32-soap-film.md`](../32-soap-film.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
## ~~32a. The CPU reference~~ — **Shipped, #403** (`src/lib/soapFilm.ts`, `cosI` on `filmReflectance` in `src/lib/filmTable.ts`, `npm run soapfilm` wired into `checks.yml`'s `logic` part; `npm run soapfilm` 23/23, `npm run filmtable` 8/8, 600 steps on 32×64 in 0.69 s; story in `docs/plan-shipped.md` §32a)

## ~~32b. The reflected view~~ — **Shipped, #469** (`soapFilmRgb` in `src/lib/soapFilm.ts`; the colour grade is 32b-1 below)

**Shipped.** Story in `docs/plan-shipped.md` §32b (moved 2026-10-29, 19m; the heading's numbers moved 2026-10-29, 19m-2).

## ~~32c. The GPU solver~~ — **Shipped, #505** (`src/gpu/soapFilm.ts`, `src/gpu/wgsl/soapFilm.ts`; `npm run soapgpu` 29/29 on Metal)

**Shipped.** Story in `docs/plan-shipped.md` §32c (moved 2026-10-29, 19m; the heading's numbers moved 2026-10-29, 19m-2).

## ~~32f. The frame drains the film (shortcut c)~~ — **Shipped** (`drainToBorder` in `src/lib/soapFilm.ts`, the border pass in `src/gpu/wgsl/soapFilm.ts`'s `soapTransport`; `npm run soapfilm` C8, five lines; `npm run soapgpu` 32f)

**Shipped.** Story in `docs/plan-shipped.md` §32f (2026-10-30).

## ~~32g. Black spots on Vrij's clock (shortcut d)~~ — **Shipped** (`blackSpots` in `src/lib/soapFilm.ts`, the same in `soapTransport`; `npm run soapfilm` C9, four lines; `npm run soapgpu` 32g, two)

**Shipped.** Story in `docs/plan-shipped.md` §32g (2026-10-30).

## ~~32e. The phone~~ — **Shipped with 32d** (Soap Film, Drain Rate and Film Angle on the phone's remote, `RemoteControl.tsx`, as on the desk; `npm run phone` 366/366, `layout` 86/86)

*Not doing now:* a thickness that follows the dye (the film is its own medium; mixing it
with the pigment's opacity is 18k's old shortcut, and the reason for this section), Marangoni
plug flow (named above), and any recorded footage as a texture.

## ~~32d. On the plate~~ — **Shipped** (the look Soap Film, settings `soapFilm`, `soapFilmRate`, `soapFilmAngle`; `src/gpu/soapFilmPlate.ts`, `src/gpu/soapFrame.ts`, `src/gpu/wgsl/soapFilmPlate.ts`, `soapFilmOver` in `src/gpu/wgsl/plateThinFilm.ts`; `npm run soapplate` 13/13; story in `docs/plan-shipped.md` §32d)

- ~~**32d-6**~~ **shipped** (#928): The film's colours took too much light from the plate. `SOAP_GAIN` is 1 and `soapFilmOver` lays Airy's R over the plate in linear light with T = 1 − R: the 0–1.5 µm wedge lets through at least 92.9% (mean 95.9%, correlated 0.94 with Airy), an 8 nm black film 99.87% (`npm run soapplate`, 23/23; main's shader fails both lines in the same harness). The harness draws its sections 2 and 7 on a clean plate, since dye laid in sRGB under a 4% film had been what it measured. No Lace control for more than Airy was added.
  Was:
  `SOAP_GAIN` is 4 (`plateThinFilm.ts:172`), and `:204-217` take up to 60% of the light where
  Airy's reflectance of a soap film is at most 7.8%; R is applied unscaled and not in linear
  light. Use Airy's R in linear light, with any extra as an optional Lace control. Check: a
  0–1.5 µm wedge transmits at least 92%, and black film over 99%. (38v, from RS-29.)
