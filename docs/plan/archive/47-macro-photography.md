# Archive: 47. The closeup as a macro photographer films liquid (asked 2026-11-11)

The closed items of [`docs/plan/47-macro-photography.md`](../47-macro-photography.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## 47b. Dark-field and Rheinberg lighting for the closeup (S–M)

~~**47b-1** A side lamp~~ (shipped; story in `docs/plan-shipped.md` §47e-47d-1-47b-1): Side Light, Side Colour and Side Angle, a second coloured
lamp raking in low from one side over the glow (the Microlab films' amber or magenta over
blue), lighting the pigment by single back-scatter, the glasses' slopes by Fresnel and the
glitter by the mirror law, falling off by the inverse square across the stage (`npm run glint`).

## 47d. Depth of field from the gap's real depth, with bokeh in linear light (M)

~~**47d-1** The glitter's depth of field and the iris's stars~~ (shipped; story in `docs/plan-shipped.md` §47e-47d-1-47b-1): each flake has
its height in the gap; the lens (magnification 0.27 × zoom on a full-frame sensor, Lens Stop
f/1.4 to f/22, focal plane at Projector Focus) draws it as its aperture's disc, a hexagon
from a six-bladed iris stopped down and a circle wide open, of diameter |z − z_f|·gap·m/(N(1+m)),
in linear light; and stopped down, its Airy core grows (1.22 λ N (1+m)/m, per colour) and
six diffraction spikes reach out from it, fading as the flake leaves focus.

## 47e. Sparkle: microbubbles and mica that show the flow (M)

~~**47e** Sparkle, its glitter half~~ (shipped; story in `docs/plan-shipped.md` §47e-47d-1-47b-1): Glitter puts up to 32,768 polystyrene
flakes in the liquid, riding the dye's own flow at their height in the gap (Poiseuille's
profile), turning in integrated Jeffery orbits (the shortcut above is not taken), settling
by Stokes and lying flat where they land, and flashing where the side lamp or the softbox
meets the mirror angle; dark specks on a lamp ground.

## 47n. A side view: a falling thread and a gravity current in a tank (L; owner's call)

~~**47n-1** The tank~~ (shipped; story in `docs/plan-shipped.md` §47n-1): Tank, a vertical
slice of water with heavy dye falling from a nozzle (`src/lib/tank.ts`, `src/gpu/tank.ts`,
drawn in the plate's place by `src/gpu/tankDraw.ts`), with Feed, Dye Weight, Nozzle, Drain
and Glow Hue on the desk, the phone and MIDI; a held finger carries the nozzle.
`npm run tank`, `npm run tankgpu`.

## 47w. Found doing this: the watch tool keeps the audio and stops (S)

~~**47w-1** The download half~~ (shipped; story in `docs/plan-shipped.md` §47v-47w-1): the
cause was yt-dlp handed a bare `ffmpeg` as `--ffmpeg-location`; the tool now passes the full
path, joins a picture-and-sound pair itself and refuses an audio-only fetch.

~~**47w-2** Dissolves~~ (shipped; story in `docs/plan-shipped.md` §47w-2-47v-2-47v-3): a run
of raised change whose ends differ by a cut's worth, whose frames are mixes of its ends and
whose new picture the take never showed (`scripts/watchcuts.mjs`); 12 found in the Joshua
Light Show film, each a superimposition on the sheets.

## 47v. Watching any link: a design read, a physics read and the techniques (S–M)

~~**47v**~~ (shipped; story in `docs/plan-shipped.md` §47v-47w-1). Asked 2026-11-12: point
Claude at any video or animation and get meaningful feedback on colour and form, a physics
read, and the techniques used, and judge our own visuals the same way.

~~**47v-2** A reference library~~ and ~~**47v-3** the physics read's real-footage bars~~
(shipped; story in `docs/plan-shipped.md` §47w-2-47v-2-47v-3): `--keep`, `--refs` and `--vs
<name>` over `/mnt/project-files/references/` (`scripts/watchrefs.mjs`); two performance films
read and kept, their numbers in `REAL_SHOWS` (`scripts/watchphysics.mjs`) and printed beside
each band.

## 47z. Found doing this: a crowd of oil drops in vivid colour, against our drop looks (M–L)

- ~~**47z-5. A packed foam whose films meet at 120°**~~ (shipped; story in `docs/plan-shipped.md`
  §47z-5): the look **Foam Cells**, a packed emulsion laid pressed across the dish whose junctions
  the oil's tension turns to Plateau's 120° (`npm run foam`). Asked again 2026-11-13 with the
  Microlab films' cellular networks ("Ok let's do this all"). What it found, still open:
