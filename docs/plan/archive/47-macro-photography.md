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

## 47p. Packaging the link watcher for anyone (the owner's pick, 2026-11-28) (M)

- ~~**47p-1** unhook it from this repository~~ (shipped, this PR): the shared folder, the owner's
  Mac folders, Homebrew's bin folder and the settings map moved out of the code into
  `scripts/reelreader.config.json` (`scripts/watchconfig.mjs`); "Settings to try" only when a map is
  configured; `docs/watch.md` with the limits (YouTube only from a home connection, Vimeo
  can't be fetched, only videos you have the right to). `npm run watchconfig` 16/16 (before:
  10 lines in watch.mjs and watchrefs.mjs named a project place); (h2) in `npm run watchcard`.

## 47x. Watching in words, and what changed between two films (S–M)

- ~~**47x-6**~~ the watch selftest's A, B (sound against motion lag) and D (one composition change
  in the crossfade) failed on a Mac's ffmpeg-full 9.0.2, and the Homebrew default ffmpeg has no
  libvorbis (shipped, 47p-2). Reproduced on Ubuntu's ffmpeg 6.1 by making the clips with libopus:
  the same three failed. The encoder moved where the container puts the first frame (libvorbis
  32 ms in, libopus 7 ms), and the reads counted picture and sound each from its own start, with
  ffmpeg's fps filter taking for sample k the frame up to half a sample after k / rate. Now the
  picture's first frame is zero for both (`sampleAt`, `pictureStart` in watch.mjs) and sample k
  is the frame on screen at k / rate; the colour-cut test bins colours softly (`softBin`), since
  a crossfade crossing a hard bin edge jumped 0.31 in one sample and read as a cut. Clips are made
  with libvorbis or libopus, whichever the build has (`clipAudio`). Both encoders: all ok, A's
  r 0.72 → 0.83. Not yet run on the Mac's ffmpeg-full 9.0.2 itself: **47x-6b**.
- ~~**47x-11**~~ two takes of one look read as changed on Ubuntu (shipped, 47p-2): show/turnover
  and own flow speed 1.3 steps apart. The stripes are one-way and repeating, and the flow read
  failed both ways on them. With no texture up and down, every level of the search took a
  vertical shift at random, the chain through time scaled it, and seeds left the picture; and
  the seeded match was judged by a ratio of two SADs both at the codec's floor, so in some pairs
  a quarter of the blocks took the stripes' alias 17 pixels back and dragged the fit to half the
  speed. `flowField` now keeps a one-way block's motion along its texture to what the level above
  or the seed predicted (`seen`, the aperture problem, structure tensor under `APERTURE` 0.02),
  and lets the search's own match beat the seed only by more than the pair's grain (the median
  best match). The two takes now read 0.112 and 0.120 % a second (were 0.75 and 1.26), eight
  phases 0.11 to 0.16, p90 0.23 to 0.27 (was up to 8). Quarantine lifted.

## 47p. Packaging the link watcher for anyone (the owner's pick, 2026-11-28) (M)

- ~~**47p-2**~~ the self-test green on a stock ffmpeg (shipped, this PR): 47x-6 (A, B, D fail on ffmpeg-full 9.0.2, the
  Homebrew default has no libvorbis) and 47x-11 (two takes of one look read as changed on
  Ubuntu, quarantined to 12-06). The root cause, not the bar.
- ~~**47p-3** general mode by default~~ (shipped, this PR): `scripts/watchmode.mjs` reads a film
  as liquid only on three cues (one take, its own motion, coloured light on a dark ground), or
  a page naming a liquid technique and two of them, or `--liquid` / `--general` / the config's
  `mode`; the summary's **Read as** says which and why. General footage gets a **Motion**
  section in place of Physics and Techniques, no report card or Settings to try, and general
  words (low-key, linear, clustered, colour field). Measured: Big Buck Bunny graded Arc
  9.0/10 against the real shows before, now reads general with no card; the Joshua Light
  Show, glow ink and four app takes read liquid. `npm run watchmode` 21/21.
- ~~**47p-4** an HTML report and the best moment~~ (shipped, this PR): every run writes
  `report.html` (one self-contained page: the best moment, the timeline, the read, the words,
  the numbers and palette, every sheet, the detail; pictures inside it as JPEG, the clip too
  under 8 MB; no folder of the machine, the video page's words escaped; reads on a phone),
  `best.mp4` (the strongest 12 s, H.264 with sound) and `best.png` (its strongest frame), from
  `scripts/watchreport.mjs`; `--no-report` turns them off. The moment is the window with most
  motion, colour, lit area and loudness by rank, with no title card and a cost per hard cut.
  `npm run watchreport` 41/41; each choice rule and both seeks shown to catch a mutant.
- ~~**47p-5b**~~ the public judging skill (shipped, 2026-11-28): `reelreader/skill/`, a
  self-contained skill folder the release copies: honesty rules first, the reading order, a
  content read from the sheets, lenses for anyone, an editor, a colourist and a VJ or liquid
  artist, the helper agent and the words guide (moved here from `docs/`), a worked example,
  an eval-set guide on `ratings.json`, and a test set of four clips with known answers (an
  edited cartoon, a good liquid take, the same take frozen and the same take turned as a
  whole, both bad takes run with `--liquid`) plus a linked real show. `npm run reelset` holds
  the folder whole, free of this project's names, and the key's measured half true.
  ChromaGlass's layer stays on top in `.claude/skills/watch/` (our faults, the Mac route, the
  settings map, the real shows). The agreement line now says "your ratings", not the owner's.
