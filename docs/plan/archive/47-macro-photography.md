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

## 47v. Watching any link: a design read, a physics read and the techniques (S–M)

- ~~**47v-6. A crop too small to read says so.**~~ Shipped, this PR (story in `docs/plan-shipped.md`).
- ~~**47v-5. Carried on real footage: the grain taken out.**~~ Shipped, this PR (story in `docs/plan-shipped.md`); it moved
  the real films' carried only from 0.187 to 0.229 and from 0.125 to 0.127, so 47v-8 is what is left.

## 47x. Watching in words, and what changed between two films (S–M)

- ~~**47x-1** the words~~ (**shipped**): `scripts/watchwords.mjs` (`describe()`, `BANDS` table),
  `## In words` (and reference section with `--vs`) in `summary.md`, `words` returned by `watchVideo`.
- ~~**47x-2** what changed~~ (**shipped**): `compareReads()` in `scripts/watchwords.mjs`,
  `scripts/watchpair.mjs` (`watchPair()`), `--before`/`--after` in `watch.mjs` writing `diff.md`, `diff-timeline.png`, `pairs.png`.
- ~~**47x-3** tried on real pairs~~ (**shipped**): blow-48's two webm takes, the 38u Classic
  closeup and the cell bloom, through `--before/--after`, shown to the owner on one page. The
  Classic closeup crashed the read: `paletteStrip` (`scripts/watchdesign.mjs`) placed each edge
  on the last rounded one and ran a column past the strip (selftest H). The change sentences
  read "swells more swells a minute"; each measure now has a plain sentence with a subject
  ("the edges got softer, and became painterly, graded edges (edge width 1.81 to 7.06% of
  width)"). The cell bloom's only change was hues a frame 3 to 2 (47x-7).
- ~~**47x-4** a plan for sharing the watch tool as a Claude Code plugin~~ (**shipped**):
  `docs/watch-plugin-plan.md`. Packaging waits on the owner (the name, its own repository or
  this one, whether the liquid show references ship as examples).
- ~~**47x-5**~~ (shipped, this PR: a word that differs while its measure moved under a step is listed under "Near an edge", not as a change) a word that flickers at a band edge. A word can be said in one read and not the
  other while its measure held under a step (the bloom's "weight: light" and "space:
  indirect" are only in its after read). `compareReads` should say a word came or went only
  when its measure moved a step, or the bands need a margin either side.
- ~~**47x-7**~~ (shipped, this PR: hues a frame is the mean over the frames; the bloom's 3 to 2 now holds) an integer measure moving by one (hues a frame 3 to 2) counts as a whole step, so a
  film whose hue count sits at a boundary reads as changed. Use the mean over the samples, not
  the median's integer, or hold one-unit changes of a count to a half step.
- ~~**47x-8**~~ (shipped, this PR) the whole film in a paragraph. The owner asked (2026-11-22) how
  the show felt overall, not only what moved: `scripts/watchoverall.mjs` reads the arc in
  thirds (holds, builds, settles, swells, dips, rises and falls), the Laban character, the
  strongest moment and the longest rest, the light and colour drift, the reorganisations and
  the hold on the music, and the look in a line. It is `## Overall` in summary.md and `## How it
  felt` in diff.md, with how the arc changed.
- ~~**47x-10**~~ the flow read aliased (shipped, this PR). The words check's drifting
  stripes (a 64-pixel period moving a pixel a frame) move almost half their period in the
  second the physics read pairs over, so the backward shift matched as well as the true one:
  one ffmpeg read the drift 7.1 and 6.9 % a second backwards, Ubuntu's split the two takes by
  two steps, the truth being 9.4 forwards. `flowField` now follows the motion through time,
  one sample then lags of 3, 8 and 10, each seeded from the last.

## 47a. Detail at the closeup's own scale: a fine window, with the dye finer than the flow (L)

~~**47a** The fine window~~ (shipped; story in `docs/plan-shipped.md` §47a): the dye carried over
the closeup's frame at two screen pixels a texel through the solver's velocity, without diffusion,
about once a frame, drawn at the grid's thickness round each cell (Fine
Detail, Macro section, default 1; `gpu/fineDye.ts`, `npm run finedye`).
~~**47a-1** Particles and the edge at screen scale~~ (dropped for 47a, 2026-11-13): the particles
born in the window drew Poisson grain; the edge is the fine field's seed, which undoes the grid's
blur.
- ~~**47x-12**~~ Reading YouTube footage honestly (**shipped**, this PR: `scripts/watchfootage.mjs`): crops black-and-still
  letterbox/pillarbox bars (`--crop` wins, `--no-autocrop` disables), masks burnt-in sharp
  still overlays out of every read, excludes title-card spans, estimates global camera
  translation from block flow (`cameraShare`, keeping `wholeShare`), and flags detail
  measures unreliable under compression softness.
- ~~**47x-13**~~ An artistic report card (**shipped**, this PR: `scripts/watchcard.mjs`): `reportCard(read, { cal, ratings })`
  scores seven canons (Unity, Complexity, Intensity, Arc, Surprise, Music fit, Restraint)
  from 0 to 10 by calibrating each measure against real liquid shows in `REAL_SHOW_CARDS`
  using the existing just-noticeable steps, prints `## Report card` in `summary.md` and side
  by side under `--vs`, and computes Spearman's rho against a library `ratings.json`.
- ~~**47x-14**~~ From a gap to the settings that close it (**shipped**, this PR: `scripts/watchsettings.mjs`): `MEASURE_SETTINGS`
  maps every comparable measure to `DEFAULT_SETTINGS` keys (`src/types.ts`) with real physics
  before post grades, and `gapSettings(gaps)` writes `## Settings to try` under `--vs` (with
  current values when `--settings` or a take's settings block is given).
