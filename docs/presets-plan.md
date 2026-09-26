# The presets

A preset is judged by eye, so the set is checked with pictures:
`npm run gallery` (or the **Preset gallery** workflow on macOS, which uploads
the `preset-gallery` artifact) photographs every preset at 8, 20 and 40
seconds, with the band playing, and puts them all on one contact sheet.

## What the set is for

- **Every preset looks different from every other.** Near-copies are made
  into new looks rather than kept: the fire trio, the two galaxies, the two
  exclusion looks and the two neon reefs used to share their dyes and their
  motion.
- **The colours sing.** Each preset names two to four dyes from the palette
  (`PRESET_CONTRACTS` in `src/presetPlate.ts`), chosen as a family rather than
  a rainbow. The palette has 24 colours; the second eight (teal to lavender)
  fill the gaps the first sixteen left.
- **The app gets used.** Each feature appears in at least one preset, so
  someone who only picks looks still sees it:

  | Feature | Where |
  |---|---|
  | Kaleidoscope | Fractal Dream |
  | Chemistry | Neon Coral Reef, Sensual Laboratory |
  | Dye particles | Stardust Collapse |
  | Bubbles | Boiling Point |
  | Ferrofluid and magnet | Magnet Garden, Ferro Maze, Ferro Paint |
  | Film stock | Home Movie |
  | Curved glasses and depth drag | Clock Glass |
  | Gel wheel | Acid Trip, Oil Wheel |
  | Round dish | Fractal Dream, Oil Wheel, Home Movie, Clock Glass |
  | Light through dye | Deep Ocean, Lava Lamp, Velvet Underground, Glycerine Drift, Clock Glass |
  | Macro music sync | Macro Bead, Cell Bloom, Lacing Run |

## Rules a preset keeps

- Every value is inside its control's range (`npm run plate`).
- Every preset names its dyes, its injection styles and its liquids
  (`npm run plate`).
- No fade between two presets gets darker than both ends (`npm run desk`),
  so a switch is never hidden behind a dip.
- Classic is the harnesses' plate (`wall`, `qa`, `fx`, `depth`, `crash` all
  load it), and `wall` needs its frame lit edge to edge: no round dish or
  vignette on Classic. `fx` compares the post chain against the plain frame
  on it to within ten 8-bit steps, and that margin moved with Classic's
  colours: amber, magenta and ultramarine or lavender left it at ten or
  eleven. Classic keeps its original yellow, pink and blue.
- A preset id, once shipped, stays: songs, cue lists and MIDI pads refer to
  it. A look that is replaced keeps its id and gets a new name and settings.
