# Showreel findings: black lost under music, and combed lines (PLAN 28d)

The showreel (`npm run showreel`, `showreel.yml`) rendered every look through the app's own
Render a song to the same minute of Funkorama (Kevin MacLeod, CC BY 4.0): song 78 s to
138 s, seed 1, 960x540 at 30 fps. All times below are seconds into that clip. The song
grooves from 0 s, breaks down from 26 s to 42 s (quiet, sparse), and returns at 42 s.
Run on the Mac runners on 2026-10-10 from main as of #354 (7:28 PM PT); Antigravity's
#348, #352, #353 and #355 are not in these pictures.

To see one look again, frame for frame: `SHOWREEL_ONLY=<id> npm run showreel` on a Mac
(or `showreel.yml` by hand with `only: <id>`); the clip and its watch numbers land in
`showreel/<id>/`. The owner looked at the gallery on 2026-10-11 and chose to fix every
look and retire none.

The yardstick is the real oil-and-dye shows the film measures against (`docs/judging.md`,
`npm run film`): two or three swells a minute, calm in quiet passages, and black kept
between the bodies the whole time.

## 1. Ten looks open on black and lose it under the music

"Black" is the share of the frame under the watch's dark threshold (`dark` in the watch's
`stats.tsv`), read off each clip. Start is the most black in the first 5 s; "half" is when
it first falls under half of that.

| Look | Start | Half by | 15 s | 30 s | 45 s | 59 s | What it turns into |
|---|---|---|---|---|---|---|---|
| jellyfish-bloom | 84% | 11.0 s | 26% | 2% | 1% | 1% | pink-lilac blooms on navy, then one pastel sheet with striations from ~30 s |
| comet | 82% | 10.8 s | 24% | 9% | 17% | 7% | a magenta comet on black at 2 s, then a grey-white and lilac wash from ~22 s |
| cyberpunk | 91% | 2.8 s | 3% | 11% | 4% | 4% | neon pink and blue on black, then grey-lavender pastel with white rims by ~15 s |
| bass-drop | 66% | 2.8 s | 17% | 30% | 10% | 27% | full-frame red-pink membrane; milky pink by ~47 s |
| galaxy | 35% | 21.0 s | 24% | 13% | 10% | 10% | one violet-blue whorl filling the frame |
| aurora-borealis | 37% | 25.8 s | 20% | 16% | 16% | 12% | lime and cyan bodies on black, one pale blue-white mass by ~37 s |
| ferro-maze | 32% | 16.5 s | 17% | 13% | 9% | 6% | black cells on a white-sepia ground muddying to brown, still after ~30 s |
| neon-coral-reef | 29% | 7.3 s | 3% | 0% | 0% | 2% | neon red, yellow, cyan on black for ~12 s, salmon and teal pastel by ~30 s |
| deep-ocean | 29% | 9.8 s | 1% | 0% | 1% | 3% | a soft blue-teal wash over the whole frame from ~15 s |
| solar-flare | 26% | 7.3 s | 9% | 2% | 1% | 1% | red-yellow flames on black, then orange floods the frame by ~15 s |

The idle stills of comet, cyberpunk, jellyfish-bloom and solar-flare (the gallery's 8, 20
and 40 s frames with no sound) keep their black, so it is the music that fills the dish.
Not traced, an inference from the pictures: the music keeps pouring dye and the dish never
loses any, so every look trends to one mixed sheet; a real plate's dye spreads and thins
and its oil keeps its bodies. This is the same question as 18g ("colour leaves by
flushing"): one fix to how the music pours, or to how colour leaves, may fix all ten.

## 2. Hairline combed lines inside the bodies

Fine parallel contour striation drawn over the dye, which on a wall reads as digital rather
than as liquid. Seen on the clips' contact sheets (12 frames across the minute) on:
crowd-plate (from ~17 s), aurora-borealis, jellyfish-bloom (the pastel sheet, from ~30 s),
poster-1969, clock-glass, red-cabbage, timbre-shifter, solar-flare (in the orange flood
after ~15 s) and comet. Lace-run and macro-bead show a related moiré grain on every body.
Not traced to a pass: it sits where the dye is thick and smooth, which points at the plate
shader (the refraction or edge terms, or the pigment's grain at the dye's edge; 18e and
`npm run grainedge`) rather than the solver.

## Where the rest went

- Busier in the breakdown (28 of 41 looks move more from 26 to 42 s than in the groove),
  and Classic: Claude, "Looks calm in the breakdown".
- Five dim or flat looks (fillmore-1969, oil-wheel, colorful-cosmos, deep-ocean, galaxy)
  and four looks that are not what their names say (red-cabbage, timbre-shifter,
  chemical-clock, soap-film): small preset changes, Claude.
- White and cream grounds (ferro-maze, turing-print, roy, milk-marble, lava-lamp,
  sensual-laboratory): proposed to ship on the black ground with the lamp kept as a choice.
