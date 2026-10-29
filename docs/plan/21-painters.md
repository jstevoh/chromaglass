# 21. Looks after painters
**Partly shipped**: Roy, 1963, and Ben-Day Dots are in, measured by `npm run benday`; Roy opens as a panel, not a black stain (`npm run royopen`). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

The owner, 2026-09-27, over a screenshot of Classic at 2.8x covered in red dots on
white by accident: "kinda cool, Roy Lichtenstein type style ... let's reserve this
effect for a particular preset and a particular control." What makes the dots on
Classic is another thread's to find and stop; this section is the effect on purpose.

Open:

- **21a. Judge it on the Mac** (docs/judging.md §27): the dots' size on a wall, the
  line's weight, and whether it holds up moving at 60 fps. The lab shows still frames.
- **21b. The line is drawn round the front plate only.** It needs the dye, and it is
  drawn from the front plate's; a second plate, the film and the lamps are printed
  (dots and inks) but not outlined. Roy has one plate, so it does not show there.
- **21c. The dots do not grow with the zoom.** The screen is fixed to the picture,
  as a print's is; the owner's accidental dots at 2.8x were about twice the size.
  If a bigger dot is wanted in the closeup, the pitch could follow the zoom.
- **21e. Judge Roy a minute in** (docs/judging.md §38). The opening is measured; what
  the pours, drops and the music make of it over a minute is not (no app frames in a
  cloud session). Dye Budget went from 0.9 to 0.45 on the reasoning that a fuller plate
  runs the inks over each other into black; if it reads too empty or still muddies, the
  budget and Roy's injection styles are the two knobs.
  The opening's dot fields are tuned to the print's tint band, which any change to
  the dye's opacity before the print moves: #267 (the grain after the curve) took
  the band down by a quarter and the deploy read 47 dots; the fields were re-laid
  at 0.75 (272). A change there re-runs `npm run royopen` and re-sweeps TINT.
- **21f. Violet is laid flat** (QA-16, #293). A comic's violet is solid magenta
  with a second screen of cyan dots over it; the print lays it as the flat colour
  that reads from a step back (`BENDAY_VIOLET`), since Roy has one screen. Green
  is a true overprint and needs nothing. Lay the cyan as dots over the magenta if
  violet reads too smooth beside the dotted washes.
  Found with it: the seam line is drawn wherever two inks meet, and there are five
  now, so a player's pool shading from yellow to teal gets two pen lines inside it
  (yellow, green, blue) where it had one. A comic outlines each colour area, so
  this is inferred to be right; judge it on the Mac (judging.md §38).
- **21d. More painters.** The same print with other inks is the start of more looks
  after painters (a Warhol screen print's off-register blocks, Riley's black and
  white, Rothko's soft fields); none is planned yet.

*Found along the way (for §14b's owner, not this section's):* on this PR's two Mac
runs, `npm run wall`'s "every refresh's own timestamp was believed" read 2, 4, 4, 5, 5
and then 1, 1, 1, 1, 3 fallbacks across its five two-window cases, while #207's run on
the same base read 0; the same harness in a cloud session reads 0 on this branch, and
the plate's display pipeline compiles in the same time with and without the print
(SwiftShader, 2.0–2.4 s both). `stampFallbacks` is a page-wide total, so one early
fallback turns every later case red, and it did not say which bound tripped. This PR
now counts them apart (`stampMisses`), and the next Mac run said which: 4 to 6, every
one ahead of now, the worst by 2.4 ms in every case, none stale. The draw gate had
believed a stamp only up to 2 ms ahead, on the belief that Chrome never stamps a
refresh ahead of now; it now believes up to one 240 Hz refresh (4.2 ms), which the
gate's 0.6-of-a-refresh margin already treats as the same refresh. Still open for
§14b: which clock runs ahead (the show's frames or the wall's converted ones; the
count is page-wide), and whether the 2.4 ms is a Mac display link stamping the refresh
a frame is for (inferred, not measured). And the line catches a wrongly converted wall
only because the harness opens the wall five seconds after the show (the conversion's
error is that gap, caught by the one-second stale bound); with under a second between
them it would pass. **Fixed:** the harness (`scripts/wall.mjs`) checks its own gap is
over a second (`originGap >= 1000`).
