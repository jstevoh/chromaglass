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
